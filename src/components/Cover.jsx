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

export default function Cover({ book, className = '' }) {
  const url = useCover(book);
  if (url) return <img className={`cover ${className}`} src={url} alt="" draggable={false} />;

  const hue = hueFor(book.title || book.fileName);
  return (
    <div
      className={`cover cover-placeholder ${className}`}
      style={{ background: `linear-gradient(160deg, hsl(${hue} 38% 34%), hsl(${(hue + 40) % 360} 42% 20%))` }}
    >
      <span className="cover-title">{book.title}</span>
      {book.author && <span className="cover-author">{book.author}</span>}
    </div>
  );
}
