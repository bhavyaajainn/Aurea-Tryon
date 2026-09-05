'use client';

import {
  FilesetResolver,
  FaceLandmarker,
  PoseLandmarker,
  type FaceLandmarkerResult,
  type PoseLandmarkerResult,
} from '@mediapipe/tasks-vision';
import { computeNeckAnchor } from './anchor';
import { AnchorSmoother } from './oneEuro';
import type { TrackerFrame } from './types';

/**
 * Model assets. Mirror these into /public and point the constants at your own
 * origin before shipping — the Google buckets are fine for development but you
 * do not want a third party in your critical path in production.
 */
export const TRACKER_ASSETS = {
  wasm: 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm',
  face: 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
  pose: 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task',
};

export type TrackerQuality = 'balanced' | 'face-only';

/**
 * Wraps the two MediaPipe graphs behind one call.
 *
 * The pose model roughly doubles per-frame cost, so "face-only" exists for
 * weaker devices — it still works, it just estimates width from the jaw.
 */
export class NeckTracker {
  private face: FaceLandmarker | null = null;
  private pose: PoseLandmarker | null = null;
  private smoother = new AnchorSmoother();
  private earLSmoother = new AnchorSmoother();
  private earRSmoother = new AnchorSmoother();
  private lastVideoTime = -1;
  private cachedFrame: TrackerFrame = { anchor: null, earL: null, earR: null, hasFace: false, hasShoulders: false };
  /** True while detectImage() has the shared landmarkers switched to IMAGE mode. */
  private imageModeActive = false;

  constructor(private quality: TrackerQuality = 'balanced') {}

  async load(): Promise<void> {
    const fileset = await FilesetResolver.forVisionTasks(TRACKER_ASSETS.wasm);

    // MediaPipe's WASM runtime logs a routine initialisation notice —
    // "Created TensorFlow Lite XNNPACK delegate for CPU" — through
    // console.error rather than console.info. In dev that trips Next's error
    // overlay on every model load as if the app had thrown. Filter just that
    // one known-benign line for the duration of this call; everything else
    // still passes through untouched.
    const originalError = console.error;
    console.error = (...args: unknown[]) => {
      if (typeof args[0] === 'string' && args[0].includes('Created TensorFlow Lite XNNPACK delegate')) return;
      originalError(...args);
    };

    try {
      this.face = await FaceLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: TRACKER_ASSETS.face, delegate: 'GPU' },
        runningMode: 'VIDEO',
        numFaces: 1,
        outputFaceBlendshapes: false,
        outputFacialTransformationMatrixes: false,
      });

      if (this.quality === 'balanced') {
        this.pose = await PoseLandmarker.createFromOptions(fileset, {
          baseOptions: { modelAssetPath: TRACKER_ASSETS.pose, delegate: 'GPU' },
          runningMode: 'VIDEO',
          numPoses: 1,
          minPoseDetectionConfidence: 0.5,
          minPosePresenceConfidence: 0.5,
          minTrackingConfidence: 0.5,
        });
      }
    } finally {
      console.error = originalError;
    }
  }

  get ready(): boolean {
    return this.face !== null;
  }

  /**
   * Reads one video frame. Returns the previous result unchanged if the video
   * has not advanced, which happens whenever rAF outruns the camera.
   */
  detectVideo(video: HTMLVideoElement, timestampMs: number): TrackerFrame {
    if (!this.face || this.imageModeActive || video.readyState < 2) return this.cachedFrame;
    if (video.currentTime === this.lastVideoTime) return this.cachedFrame;
    this.lastVideoTime = video.currentTime;

    let faceRes: FaceLandmarkerResult | null = null;
    let poseRes: PoseLandmarkerResult | null = null;

    try {
      faceRes = this.face.detectForVideo(video, timestampMs);
      if (this.pose) poseRes = this.pose.detectForVideo(video, timestampMs);

      this.cachedFrame = this.assemble(
        faceRes?.faceLandmarks?.[0] ?? null,
        poseRes?.landmarks?.[0] ?? null,
        video.videoWidth,
        video.videoHeight,
        timestampMs,
      );
    } catch {
      // A dropped frame during a device switch is not worth tearing down for.
    }
    return this.cachedFrame;
  }

  /** Single-shot path for the "use a photo instead" mode. */
  async detectImage(image: HTMLImageElement | HTMLCanvasElement): Promise<TrackerFrame> {
    if (!this.face) return { anchor: null, earL: null, earR: null, hasFace: false, hasShoulders: false };

    let faceRes: FaceLandmarkerResult | null = null;
    let poseRes: PoseLandmarkerResult | null = null;
    let anchor = null;
    let earL = null;
    let earR = null;
    let usedShoulders = false;

    this.imageModeActive = true;
    try {
      await this.face.setOptions({ runningMode: 'IMAGE' });
      faceRes = this.face.detect(image);

      if (this.pose) {
        await this.pose.setOptions({ runningMode: 'IMAGE' });
        poseRes = this.pose.detect(image);
      }

      const w = 'naturalWidth' in image ? image.naturalWidth : image.width;
      const h = 'naturalHeight' in image ? image.naturalHeight : image.height;

      // Photos get no temporal smoothing — there is nothing to smooth against.
      const result = computeNeckAnchor(
        faceRes?.faceLandmarks?.[0] ?? null,
        poseRes?.landmarks?.[0] ?? null,
        w,
        h,
      );
      anchor = result.neck;
      earL = result.earL;
      earR = result.earR;
      usedShoulders = result.usedShoulders;
    } catch {
      // Fall through with the empty result below — the finally block still
      // restores VIDEO mode so the live loop isn't left stuck in IMAGE mode.
    } finally {
      await this.face.setOptions({ runningMode: 'VIDEO' });
      if (this.pose) await this.pose.setOptions({ runningMode: 'VIDEO' });
      this.lastVideoTime = -1;
      this.imageModeActive = false;
    }

    return { anchor, earL, earR, hasFace: !!faceRes?.faceLandmarks?.length, hasShoulders: usedShoulders };
  }

  private assemble(
    faceLm: { x: number; y: number; z: number }[] | null,
    poseLm: { x: number; y: number; z: number; visibility?: number }[] | null,
    w: number,
    h: number,
    t: number,
  ): TrackerFrame {
    const { neck, earL, earR, usedShoulders } = computeNeckAnchor(faceLm, poseLm, w, h);
    if (!neck) {
      this.smoother.reset();
      this.earLSmoother.reset();
      this.earRSmoother.reset();
      return { anchor: null, earL: null, earR: null, hasFace: !!faceLm, hasShoulders: false };
    }
    return {
      anchor: this.smoother.apply(neck, t),
      earL: earL ? this.earLSmoother.apply(earL, t) : null,
      earR: earR ? this.earRSmoother.apply(earR, t) : null,
      hasFace: true,
      hasShoulders: usedShoulders,
    };
  }

  close(): void {
    this.face?.close();
    this.pose?.close();
    this.face = null;
    this.pose = null;
    this.smoother.reset();
    this.earLSmoother.reset();
    this.earRSmoother.reset();
  }
}
