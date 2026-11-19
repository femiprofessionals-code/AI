import * as ImagePicker from 'expo-image-picker';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import { Directory, File, Paths } from 'expo-file-system';
import { Platform } from 'react-native';
import { repo } from '../../db/repo';
import type { PhotoKind, PhotoRow } from '../../db/types';
import { BODY_PARTS } from '../../content/types';
import { CARTOON_MARKERS } from '../../games/photo';

// Photos are copied into the app's private folder. Nothing is uploaded and no
// face detection runs: the parent places every marker by hand.
const dir = () => {
  const d = new Directory(Paths.document, 'photos');
  if (!d.exists) d.create({ intermediates: true, idempotent: true });
  return d;
};

export async function pickPhoto(kind: PhotoKind, from: 'camera' | 'gallery'): Promise<PhotoRow | null> {
  if (from === 'camera') {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) return null;
  }
  const opts: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], allowsEditing: true, quality: 0.9, aspect: kind === 'full_body' ? [3, 5] : [1, 1] };
  const res = from === 'camera' ? await ImagePicker.launchCameraAsync(opts) : await ImagePicker.launchImageLibraryAsync(opts);
  if (res.canceled || !res.assets?.[0]) return null;
  const a = res.assets[0];
  const small = await manipulateAsync(a.uri, [{ resize: a.width > a.height ? { width: 1200 } : { height: 1600 } }], { compress: 0.85, format: SaveFormat.JPEG });
  let uri = small.uri;
  if (Platform.OS !== 'web') {
    const dest = new File(dir(), `${kind}-${Date.now()}.jpg`);
    new File(small.uri).copy(dest);
    uri = dest.uri;
  }
  const old = repo.getPhotos().find((p) => p.kind === kind);
  // Start markers where the cartoon body has them; the parent then drags each one.
  const markers: PhotoRow['markers'] = {};
  BODY_PARTS.forEach((p) => (markers[p] = old?.markers[p] ?? { ...CARTOON_MARKERS[p] }));
  const row: PhotoRow = { kind, uri, width: small.width, height: small.height, markers, updatedAt: Date.now() };
  if (old) deleteFile(old.uri);
  repo.savePhoto(row);
  return row;
}

function deleteFile(uri: string) {
  if (Platform.OS === 'web' || uri === 'starter') return;
  try { const f = new File(uri); if (f.exists) f.delete(); } catch {}
}

export function deletePhoto(kind: PhotoKind) {
  const p = repo.getPhotos().find((x) => x.kind === kind);
  if (p) deleteFile(p.uri);
  repo.deletePhoto(kind);
}

export function deleteAllPhotos() {
  repo.getPhotos().forEach((p) => deletePhoto(p.kind));
  if (Platform.OS !== 'web') { try { const d = new Directory(Paths.document, 'photos'); if (d.exists) d.delete(); } catch {} }
}
