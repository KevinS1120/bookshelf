# Bookshelf

A personal reading app for PDF, EPUB and Kindle (AZW3/MOBI) books that works on any device. Your library lives in a
**Bookshelf** folder in your personal OneDrive: each book is a file there, and your status, rating,
dates, progress, notes and bookmarks sync between devices. You can stop on your phone and carry on
from the same spot on your iPad.

The app is a static website hosted free on GitHub Pages: <https://kevins1120.github.io/bookshelf/>.
It signs in with your Microsoft account and talks to OneDrive through Microsoft Graph. No server
or PC needs to be running.

## Using it

Open <https://kevins1120.github.io/bookshelf/> and sign in with your personal Microsoft account. The
first time, it creates the Bookshelf folder in your OneDrive.

On a phone or tablet, open the same address (or scan the QR code under **⚙ Settings**) and sign
in with the same account. On iPhone/iPad, use Safari's Share → **Add to Home Screen** for an app icon.

You can add books in the app, or just put PDF/EPUB files in the OneDrive Bookshelf folder from
anywhere and they'll show up.

## App registration (already done)

The app is registered in Microsoft Entra as "Bookshelf" (client ID in `src/config.js`):

- Supported account types: any Entra ID tenant + personal Microsoft accounts (the app signs in
  with personal accounts only)
- Single-page application redirect URIs: `https://kevins1120.github.io/bookshelf/` and
  `http://localhost:5173/`
- Permissions requested at sign-in: `User.Read`, `Files.ReadWrite`

Every push to `main` deploys to GitHub Pages through `.github/workflows/deploy.yml`.

## Features

- Library with covers, search, filters, and sorting, in a dark academia theme (walnut, parchment, brass)
- **⋯ menu on every book**: read, change status (To read / Reading / On hold / Finished / Did not
  finish), start over, change cover, remove
- **Covers**: upload your own image, search Open Library, restore the book's own cover, or none.
  Changes sync to every device.
- **Genres**: tap genre tags (Fantasy, Romance, Classics, …) or add your own, and filter by genre
- **Series**: press and hold a book and drop it onto another (or click and drag) to make a named
  series; drop more books onto the series to add them. Series tags go on every book in it. Set the
  reading order by dragging, with arrows, or with Auto-order (reads "Book 2", "#3", "Vol. IV"…). Design a series cover: pick a cloth
  color, a foil stamp and one of 400 adventure icons ([game-icons.net](https://game-icons.net), CC BY 3.0)
- **Yearly reading goal**, **reading time** (this week, with a 14-day chart), and a **daily streak**
- Status, 1–5 star ratings, start/finish dates, notes
- Kindle books (AZW3, MOBI) are converted to EPUB in the browser when you add them
  ([foliate-js](https://github.com/johnfactotum/foliate-js) parser). DRM-protected Kindle Store books and KFX files can't be opened.
- Reader for PDF and EPUB: drag pages with your finger to turn them (the next page slides in),
  tap the sides, or use the arrow keys; tap the middle for full screen; drag the bar to jump
- PDFs: pinch to zoom, double-tap the middle to zoom in/out
- App-like controls: back button/gesture closes the open book or panel, panels slide up and can
  be dragged down to dismiss, long-press a book for its actions, pull down to refresh, the screen
  stays on while reading
- Bookmarks with text snippets; table of contents
- Display settings (per device): themes including Forest, custom colors, brightness, and for EPUBs
  text size, font, line spacing, alignment, margins, page width, and one page / two pages / scrolling
- Recently opened books are kept on each device so they reopen instantly
- Stays signed in; **Settings → Download reading log** exports everything as a CSV

## Your data

Everything is in your OneDrive's Bookshelf folder. Books are ordinary files. Reading data for all
books is in `_bookshelf/library.json`, and covers and EPUB page maps are in `_bookshelf` too.
Saves check that the file hasn't changed on another device in the meantime, and merge if it has.
Deleting a book in the app moves it to the OneDrive recycle bin.

## Development

```
npm install
npm run dev
```

Then open <http://localhost:5173>.

- `src/auth.js`: Microsoft sign-in (MSAL)
- `src/graph.js`: Microsoft Graph requests
- `src/library.js`: the OneDrive library: listing, uploads, reading data, batched saves
- `src/cache.js`: per-device cache of book files and covers
- `src/settings.js`: reader display settings
- `src/components/`: screens and the PDF/EPUB readers
