import { useEffect, useState } from 'react';
import { coverBlob } from '../library';
import { hueFor } from '../util';

function useCover(book) {
  const [url, setUrl] = useState(null);
  const { id, coverVersion, noCover } = book;
  useEffect(() => {
    let objectUrl = null;
    let alive = true;
    setUrl(null);
    coverBlob({ id, coverVersion, noCover }).then((blob) => {
      if (!alive || !blob) return;
      objectUrl = URL.createObjectURL(blob);
      setUrl(objectUrl);
    });
    return () => {
      alive = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [id, coverVersion, noCover]);
  return url;
}

// hue, saturation, lightness: oxblood, cognac, forest, navy, plum, ochre, slate
const BINDINGS = [
  [2, 45, 26],
  [24, 45, 26],
  [150, 28, 20],
  [215, 35, 22],
  [320, 22, 22],
  [38, 50, 28],
  [200, 12, 24],
];

export default function Cover({ book, className = '' }) {
  const url = useCover(book);
  if (url) return <img className={`cover ${className}`} src={url} alt="" draggable={false} />;

  // Books without a cover look leather-bound, in classic binding colors.
  const [h, sat, light] = BINDINGS[hueFor(book.title || book.fileName) % BINDINGS.length];
  return (
    <div
      className={`cover cover-placeholder ${className}`}
      style={{ background: `linear-gradient(160deg, hsl(${h} ${sat}% ${light + 8}%), hsl(${h} ${sat}% ${light - 6}%))` }}
    >
      <span className="cover-title">{book.title}</span>
      {book.author && <span className="cover-author">{book.author}</span>}
    </div>
  );
}
