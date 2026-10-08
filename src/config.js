// Microsoft Entra app registration (see README → "One-time setup").
// These identify the app; they are not secrets and are safe to publish.
export const MS_CLIENT_ID = 'bac630eb-298c-4339-97b8-edc319dac907';
export const MS_TENANT = 'gatech.edu';

export const GRAPH_SCOPES = ['User.Read', 'Sites.ReadWrite.All', 'Sites.Manage.All'];

// Where the app is running, e.g. https://kevins1120.github.io/bookshelf/ or http://localhost:5173/
export const APP_URL = new URL('.', window.location.href.split(/[?#]/)[0]).href;
