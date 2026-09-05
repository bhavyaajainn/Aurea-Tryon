/** Central place for anything SEO/metadata touches, so the domain only lives in one spot. */
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || 'https://aurea-tryon.vercel.app').replace(/\/$/, '');
export const SITE_NAME = 'Aurea';
export const SITE_TITLE = 'Aurea — Virtual Jewelry Try-On | Try On Necklaces & Earrings Online';
export const SITE_DESCRIPTION =
  'Try on your own necklace, pendant, or earrings with your camera before you buy — free, private, and instant. Upload a photo, straighten and clean it up, then see it hang exactly where it would in life. Nothing is ever uploaded or saved.';
