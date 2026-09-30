import { RESTAURANT } from '../../config/brand.js';

/**
 * "Mandi | Chinese | Tandoori | Meals | Snacks | Biryani" as two halves, so
 * narrow screens can break it into exactly two tidy lines ("Mandi | Chinese |
 * Tandoori" / "Meals | Snacks | Biryani") instead of wherever the text runs
 * out of room. Wide screens join the halves on one line.
 */
export default function Tagline() {
  const parts = RESTAURANT.tagline.split('|').map((part) => part.trim());
  const half = Math.ceil(parts.length / 2);
  return (
    <h3 className="tagline">
      <span className="tagline-line">{parts.slice(0, half).join(' | ')}</span>
      <span className="tagline-join"> | </span>
      <span className="tagline-line">{parts.slice(half).join(' | ')}</span>
    </h3>
  );
}
