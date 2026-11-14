// Phone build: shots are cut by the studio server once uploads from the phone app land.
// Until then the live switch runs from the web app.

export interface ShotFile {
  blob: Blob;
  filename: string;
  contentType: string;
}

export async function trimShot(_source: Blob, _startSec: number, _endSec: number, _fps: number, _name: string): Promise<ShotFile> {
  throw new Error('The live switch runs from the web app for now. Open this project there to switch it.');
}
