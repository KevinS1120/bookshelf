# Bookshelf

A personal reading app for PDF and EPUB books that works on any device. Your library lives in a
SharePoint document library (your OneDrive counts): each book is a file, and your status, rating,
dates, progress, and notes are columns beside it. Bookmarks and your exact reading position sync
too, so you can stop on your phone and carry on from the same spot on your iPad.

The app is a static website (hosted free on GitHub Pages) that signs in with Microsoft and talks to
SharePoint through Microsoft Graph. No server or PC needs to be running.

## One-time setup

### 1. Register the app in Microsoft Entra

1. Go to <https://entra.microsoft.com> and sign in with your Georgia Tech account.
2. **Applications → App registrations → New registration**
   - Name: `Bookshelf`
   - Supported account types: **Accounts in this organizational directory only**
   - Redirect URI: platform **Single-page application (SPA)**, URL `https://kevins1120.github.io/bookshelf/`
3. Click **Register**. On the overview page, copy the **Application (client) ID**.
4. **Authentication → Add URI** under Single-page application, and add `http://localhost:5173/`
   (for running it on your PC while developing). Save.
5. **API permissions → Add a permission → Microsoft Graph → Delegated permissions**, and add
   `Sites.ReadWrite.All` and `Sites.Manage.All` (`User.Read` is already there).
   - If you see **Grant admin consent**, click it. If you can't, you'll be asked to approve when you
     first sign in, or GT may ask an administrator to approve it.

If step 2 says you don't have permission to register apps, Georgia Tech has turned that off and
you'll need to ask GT's IT to register it for you.

### 2. Put the client ID in the app

Paste it into `src/config.js` as `MS_CLIENT_ID`. It identifies the app and isn't a secret.

### 3. Publish

Push the project to the `bookshelf` repository on GitHub. In the repository, go to **Settings →
Pages → Build and deployment**, set **Source** to **GitHub Actions**, and every push to `main`
deploys automatically to <https://kevins1120.github.io/bookshelf/>.

### 4. First run

Open the site, sign in, and choose where books live:

- **My OneDrive**: creates a `Bookshelf` folder in your OneDrive. Simplest.
- **A SharePoint site library**: paste a link to any folder or document library you can edit.

The app adds its columns (Author, Status, Rating, Progress %, Started, Finished, …) to that library.

### Other devices

In the app, open **⚙ Settings** and scan the QR code with your phone or tablet. Sign in with the same
account and it opens the same library. On iPhone/iPad, use Safari's Share → **Add to Home Screen**
for an app icon.

## Features

- Library with covers, search, filters, sort, and reading stats
- Status, 1–5 star ratings, start/finish dates, notes
- Reader for PDF and EPUB: tap or swipe to turn pages, tap the middle for full screen, drag to jump
- Bookmarks with text snippets; table of contents
- Display settings (per device): themes and custom colors, brightness, and for EPUBs text size,
  font, line spacing, alignment, margins, page width, and one page / two pages / scrolling
- Recently opened books are kept on each device so they reopen instantly
- **Settings → Download reading log** exports everything as a CSV

## Your data

Everything is in the SharePoint library you chose. Books are ordinary files you can download or
open there. Reading data is in the library's columns, and covers and EPUB page maps are in a
`_bookshelf` folder. Deleting a book in the app moves it to the SharePoint recycle bin.

Georgia Tech accounts are closed some time after you leave GT. Download your books and the CSV
reading log before then.

## Development

```
npm install
npm run dev
```

Then open <http://localhost:5173>.

- `src/auth.js`: Microsoft sign-in (MSAL)
- `src/graph.js`: Microsoft Graph requests
- `src/library.js`: the SharePoint library: listing, uploads, columns, batched saves
- `src/cache.js`: per-device cache of book files and covers
- `src/settings.js`: reader display settings
- `src/components/`: screens and the PDF/EPUB readers
