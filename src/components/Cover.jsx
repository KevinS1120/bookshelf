import { useEffect, useState } from 'react';
import { coverBlob } from '../library';
import { hueFor } from '../util';

function useCover(id) {
  const [url, setUrl] = useState(null);
  useEffect(() => {
    let objectUrl = null;
    let alive = true;
    coverBlob(id).then((blob) => {
      if (!alive || !blob) return;
      objectUrl = URL.createObjectURL(blob);
      setUrl(objectUrl);
    });
    return () => {
      alive = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [id]);
  return url;
}

export default function Cover({ book, className = '' }) {
  const url = useCover(book.id);
  if (url) return <img className={`cover ${className}`} src={url} alt="" draggable={false} />;

  const hue = hueFor(book.title || book.fileName);
  return (
    <div
      className={`cover cover-placeholder ${className}`}
      style={{ background: `linear-gradient(160deg, hsl(${hue} 45% 42%), hsl(${(hue + 40) % 360} 50% 28%))` }}
    >
      <span className="cover-title">{book.title}</span>
      {book.author && <span className="cover-author">{book.author}</span>}
    </div>
  );
}
