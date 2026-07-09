import { TemplateFile, TemplateFolder } from "./path-to-json";

export function findFilePath(
  file: TemplateFile,
  folder: TemplateFolder,
  pathSoFar: string[] = []
): string | null {
  for (const item of folder.items) {
    if ("folderName" in item) {
      const res = findFilePath(file, item, [...pathSoFar, item.folderName]);
      if (res) return res;
    } else {
      if (
        item.filename === file.filename &&
        item.fileExtension === file.fileExtension
      ) {
        return [
          ...pathSoFar,
          item.filename + (item.fileExtension ? "." + item.fileExtension : ""),
        ].join("/");
      }
    }
  }
  return null;
}



// Reverse of findFilePath: given a "src/App.tsx"-style path, find the file
// node it points to. Used by follow mode to open whatever file another
// collaborator is currently on.
export function findFileByPath(
  folder: TemplateFolder,
  path: string
): TemplateFile | null {
  const segments = path.split("/");
  let current: TemplateFolder = folder;

  for (let i = 0; i < segments.length - 1; i++) {
    const next = current.items.find(
      (item) => "folderName" in item && item.folderName === segments[i]
    ) as TemplateFolder | undefined;
    if (!next) return null;
    current = next;
  }

  const fileSegment = segments[segments.length - 1];
  const dotIndex = fileSegment.lastIndexOf(".");
  const filename = dotIndex > 0 ? fileSegment.slice(0, dotIndex) : fileSegment;
  const fileExtension = dotIndex > 0 ? fileSegment.slice(dotIndex + 1) : "";

  const file = current.items.find(
    (item) =>
      "filename" in item &&
      item.filename === filename &&
      item.fileExtension === fileExtension
  ) as TemplateFile | undefined;

  return file ?? null;
}

/**
 * Generates a unique file ID based on file location in folder structure
 * @param file The template file
 * @param rootFolder The root template folder containing all files
 * @returns A unique file identifier including full path
 */
export const generateFileId = (file: TemplateFile, rootFolder: TemplateFolder): string => {
  // Find the file's path in the folder structure
  const path = findFilePath(file, rootFolder)?.replace(/^\/+/, '') || '';
  
  // Handle empty/undefined file extension
  const extension = file.fileExtension?.trim();
  const extensionSuffix = extension ? `.${extension}` : '';

  // Combine path and filename
  return path
    ? `${path}/${file.filename}${extensionSuffix}`
    : `${file.filename}${extensionSuffix}`;
}