import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { APP_URL } from '../config';
import { STATUSES, toDateInput } from '../util';

function exportCsv(books) {
  const cols = [
    ['Title', (b) => b.title],
    ['Author', (b) => b.author],
    ['Format', (b) => b.format.toUpperCase()],
    ['Status', (b) => STATUSES.find((s) => s.id === b.status)?.label],
    ['Rating', (b) => b.rating || ''],
    ['Progress %', (b) => Math.round(b.progress * 100)],
    ['Started', (b) => toDateInput(b.startedAt)],
    ['Finished', (b) => toDateInput(b.finishedAt)],
    ['Notes', (b) => b.review],
    ['File', (b) => b.fileName],
  ];
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const rows = [cols.map(([h]) => esc(h)).join(','), ...books.map((b) => cols.map(([, f]) => esc(f(b))).join(','))];
  const url = URL.createObjectURL(new Blob(['﻿' + rows.join('\r\n')], { type: 'text/csv' }));
  const a = Object.assign(document.createElement('a'), { href: url, download: 'bookshelf-reading-log.csv' });
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function SettingsDialog({ account, location, books, onSignOut, onChangeLibrary, onClose }) {
  const [qr, setQr] = useState(null);
  // Opening this link on another device connects it to the same library.
  const deviceUrl = `${APP_URL}?library=${encodeURIComponent(JSON.stringify(location))}`;

  useEffect(() => {
    QRCode.toDataURL(deviceUrl, { margin: 1, width: 240 }).then(setQr, () => {});
  }, [deviceUrl]);

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal settings" role="dialog" aria-modal="true" aria-label="Settings">
        <button className="icon-btn modal-close" onClick={onClose} aria-label="Close">
          ×
        </button>
        <h2>Settings</h2>

        <section>
          <h3>Other devices</h3>
          <div className="devices-body">
            {qr && <img className="qr" src={qr} alt="QR code to open Bookshelf on another device" />}
            <div>
              <p className="muted">
                Scan with your phone or tablet camera, then sign in with the same account. It opens this same library.
              </p>
              <ul className="tips">
                <li>
                  <strong>iPhone / iPad:</strong> in Safari tap Share → <em>Add to Home Screen</em> for an app icon.
                </li>
                <li>
                  <strong>Android:</strong> in Chrome tap ⋮ → <em>Add to Home screen</em>.
                </li>
              </ul>
              <button className="btn" onClick={() => navigator.clipboard?.writeText(deviceUrl)}>
                Copy link
              </button>
            </div>
          </div>
        </section>

        <section>
          <h3>Library</h3>
          <p>
            <strong>{location.name}</strong>{' '}
            <a href={location.webUrl} target="_blank" rel="noreferrer">
              Open in SharePoint ↗
            </a>
          </p>
          <div className="row-gap">
            <button className="btn" onClick={() => exportCsv(books)}>
              Download reading log (CSV)
            </button>
            <button className="btn" onClick={onChangeLibrary}>
              Use a different library
            </button>
          </div>
        </section>

        <section>
          <h3>Account</h3>
          <p className="muted">Signed in as {account.username}</p>
          <button className="btn" onClick={onSignOut}>
            Sign out
          </button>
        </section>
      </div>
    </div>
  );
}
