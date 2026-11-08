// A JSON file in the Bookshelf folder that several devices can change at once.
// Saves use the file's ETag: if it changed since we read it, we re-read,
// re-apply the change, and try again.
import { download, graph } from './graph';
import { folderItemPath } from './library';

export function jsonStore(rel, emptyDoc) {
  let data = null; // { doc, eTag }
  let writing = Promise.resolve();

  async function read() {
    let meta;
    try {
      meta = await graph(folderItemPath(rel));
    } catch (err) {
      if (err.status !== 404) throw err;
      data = { doc: emptyDoc(), eTag: null };
      return data.doc;
    }
    if (data?.eTag !== meta.eTag) {
      const doc = JSON.parse(await download(meta['@microsoft.graph.downloadUrl'], 'text'));
      data = { doc: { ...emptyDoc(), ...doc }, eTag: meta.eTag };
    }
    return data.doc;
  }

  // mutate(doc) changes the doc in place; it may run more than once.
  function update(mutate) {
    const run = async () => {
      if (!data) await read();
      for (let attempt = 0; attempt < 5; attempt++) {
        const doc = structuredClone(data.doc);
        mutate(doc);
        const { eTag } = data;
        try {
          const item = await graph(`${folderItemPath(rel)}/content${eTag ? '' : '?@microsoft.graph.conflictBehavior=fail'}`, {
            method: 'PUT',
            body: JSON.stringify(doc),
            headers: { 'Content-Type': 'application/json', ...(eTag ? { 'If-Match': eTag } : {}) },
          });
          data = { doc, eTag: item.eTag };
          return doc;
        } catch (err) {
          if (err.status !== 412 && err.status !== 409) throw err;
          await read(); // changed on another device; apply onto the latest copy
        }
      }
      throw new Error('This is being changed on another device. Try again in a moment.');
    };
    writing = writing.then(run, run);
    return writing;
  }

  return { read, update, current: () => data?.doc ?? null };
}
