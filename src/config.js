// Microsoft app registration (see README → "One-time setup").
// These identify the app; they are not secrets and are safe to publish.
export const MS_CLIENT_ID = 'bac630eb-298c-4339-97b8-edc319dac907';
// Personal Microsoft accounts (outlook.com, hotmail.com, live.com, …).
export const MS_TENANT = 'consumers';

export const GRAPH_SCOPES = ['User.Read', 'Files.ReadWrite'];

// The OneDrive folder that holds the library.
export const LIBRARY_FOLDER = 'Bookshelf';

// Where the app is running, e.g. https://kevins1120.github.io/bookshelf/ or http://localhost:5173/
export const APP_URL = new URL('.', window.location.href.split(/[?#]/)[0]).href;
