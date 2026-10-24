import { Directory, Encoding, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';

export async function shareFile(content, filename, mimeType) {
  const isText = /text|json|csv/.test(mimeType);
  const saved = await Filesystem.writeFile({
    path: filename,
    data: content,
    directory: Directory.Cache,
    recursive: true,
    ...(isText ? { encoding: Encoding.UTF8 } : {})
  });
  await Share.share({ title: filename, text: filename, url: saved.uri, dialogTitle: '导出眠记数据' });
}
