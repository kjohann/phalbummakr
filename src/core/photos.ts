export interface Photo {
  /** Relative to the Library root, with forward slashes. */
  path: string;
  /** Unix milliseconds; EXIF wall-clock dates without a timezone are treated as UTC. */
  captureDate: number;
  width: number;
  height: number;
  orientation: number;
  revision: string;
}

export interface PhotoScan {
  photos: Photo[];
  warnings: string[];
}
