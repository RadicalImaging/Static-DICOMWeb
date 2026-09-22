import { uids } from '@radicalimaging/static-wado-util';
import {
  FRAME_RENDITIONS,
  FRAME_RENDITION_NAMES,
  HTJ2K_LOSSY_RENDITION,
  HTJ2K_RENDITION,
  JLS_RENDITION,
  JLS_THUMBNAIL_RENDITION,
  THUMBNAIL_REDUCTION,
  renditionDimensions,
  resolveRenditions,
} from '../lib/alternates/frameRenditions.mjs';

const attributes = { rows: 512, columns: 512 };

describe('frame rendition registry', () => {
  it('offers the five outputs alternates can write, brick aside', () => {
    expect(FRAME_RENDITION_NAMES).toEqual([
      JLS_RENDITION,
      JLS_THUMBNAIL_RENDITION,
      HTJ2K_RENDITION,
      HTJ2K_LOSSY_RENDITION,
    ]);
  });

  it('keys every entry by its own directory name', () => {
    for (const [name, rendition] of Object.entries(FRAME_RENDITIONS)) {
      expect(rendition.name).toBe(name);
    }
  });

  it('names a transfer syntax that carries a content type', () => {
    // writeRenditionFrame puts uids[transferSyntaxUID].contentType in the multipart header, so
    // an unknown syntax would silently publish frames as application/octet-stream.
    for (const rendition of Object.values(FRAME_RENDITIONS)) {
      expect(uids[rendition.transferSyntaxUID]?.contentType).toBeTruthy();
    }
  });

  it('agrees with uids about which renditions are lossy', () => {
    for (const rendition of Object.values(FRAME_RENDITIONS)) {
      expect(rendition.lossy).toBe(!!uids[rendition.transferSyntaxUID]?.lossy);
    }
  });

  it('reduces only the thumbnail', () => {
    expect(renditionDimensions(attributes, FRAME_RENDITIONS[JLS_RENDITION])).toEqual({
      rows: 512,
      columns: 512,
    });
    expect(renditionDimensions(attributes, FRAME_RENDITIONS[HTJ2K_RENDITION])).toEqual({
      rows: 512,
      columns: 512,
    });
    expect(renditionDimensions(attributes, FRAME_RENDITIONS[HTJ2K_LOSSY_RENDITION])).toEqual({
      rows: 512,
      columns: 512,
    });
    expect(renditionDimensions(attributes, FRAME_RENDITIONS[JLS_THUMBNAIL_RENDITION])).toEqual({
      rows: 512 / THUMBNAIL_REDUCTION,
      columns: 512 / THUMBNAIL_REDUCTION,
    });
  });

  it('rounds odd dimensions rather than truncating them', () => {
    expect(
      renditionDimensions({ rows: 101, columns: 99 }, FRAME_RENDITIONS[JLS_THUMBNAIL_RENDITION])
    ).toEqual({ rows: 25, columns: 25 });
  });

  it('resolves names and rejects ones it does not know', () => {
    expect(resolveRenditions([HTJ2K_RENDITION, JLS_RENDITION])).toEqual([
      FRAME_RENDITIONS[HTJ2K_RENDITION],
      FRAME_RENDITIONS[JLS_RENDITION],
    ]);
    expect(() => resolveRenditions(['jp2'])).toThrow(/unknown rendition jp2/);
  });
});
