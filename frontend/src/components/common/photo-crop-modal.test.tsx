import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PhotoCropModal } from './photo-crop-modal';

// The cropper draws to a canvas jsdom does not have, so it is replaced with a
// stand-in that records the props it was given. What this file checks is what
// the modal asks the cropper for, not how the cropper paints it.
const { cropperProps } = vi.hoisted(() => {
  const current: Record<string, unknown> = {};
  return { cropperProps: { current } };
});
vi.mock('react-easy-crop', () => ({
  default: (props: Record<string, unknown>) => {
    cropperProps.current = props;
    return <div data-testid="cropper" />;
  },
}));

const file = new File(['x'], 'emblem.png', { type: 'image/png' });
const createObjectURL = vi.fn(() => 'blob:emblem');
const revokeObjectURL = vi.fn();

beforeEach(() => {
  cropperProps.current = {};
  createObjectURL.mockClear();
  revokeObjectURL.mockClear();
  vi.stubGlobal('URL', { ...URL, createObjectURL, revokeObjectURL });
});
afterEach(() => vi.unstubAllGlobals());

const noop = () => {};

/** The colour the cropper was told to draw behind the image. */
function previewBackground(): unknown {
  const style = cropperProps.current.style as { containerStyle?: { background?: string } } | undefined;
  return style?.containerStyle?.background;
}

describe('PhotoCropModal', () => {
  it('defaults to the catalog crop: a free rectangle with Use Full Image', () => {
    render(<PhotoCropModal file={file} onConfirm={noop} onClose={noop} />);

    expect(screen.getByRole('dialog', { name: 'Crop Photo' })).toBeInTheDocument();
    expect(cropperProps.current.aspect).toBeUndefined();
    expect(cropperProps.current.cropShape).toBe('rect');
    expect(screen.getByRole('button', { name: 'Use Full Image' })).toBeInTheDocument();
  });

  it('draws a round 1:1 window for an image shown in a circular cutout', () => {
    render(
      <PhotoCropModal
        file={file}
        onConfirm={noop}
        onClose={noop}
        aspect={1}
        cropShape="round"
        title="Crop Emblem"
        allowFullImage={false}
      />,
    );

    expect(screen.getByRole('dialog', { name: 'Crop Emblem' })).toBeInTheDocument();
    expect(cropperProps.current.aspect).toBe(1);
    expect(cropperProps.current.cropShape).toBe('round');
    expect(screen.queryByRole('button', { name: 'Use Full Image' })).not.toBeInTheDocument();
  });

  it('offers no fill choice unless asked, and previews the catalog as it always has', () => {
    render(<PhotoCropModal file={file} onConfirm={noop} onClose={noop} />);

    expect(screen.queryByRole('button', { name: 'Black' })).not.toBeInTheDocument();
    expect(previewBackground()).toBe('#0A0A0A');
  });

  it('previews the picked fill behind the image', async () => {
    // A logo on a solid square, zoomed out to sit inside the circle, needs the
    // rest of the circle filled to match or it reads as a square in a hole.
    const user = userEvent.setup();
    render(
      <PhotoCropModal file={file} onConfirm={noop} onClose={noop} background={null} fillOptions />,
    );

    expect(screen.getByRole('button', { name: 'None' })).toHaveAttribute('aria-pressed', 'true');
    expect(previewBackground()).toBe('#0A0A0A');

    await user.click(screen.getByRole('button', { name: 'White' }));
    expect(screen.getByRole('button', { name: 'White' })).toHaveAttribute('aria-pressed', 'true');
    expect(previewBackground()).toBe('#FFFFFF');

    await user.click(screen.getByRole('button', { name: 'Black' }));
    expect(previewBackground()).toBe('#000000');
  });

  it('does not offer None for a JPEG, which has no alpha to leave empty', () => {
    const jpeg = new File(['x'], 'emblem.jpg', { type: 'image/jpeg' });
    render(
      <PhotoCropModal file={jpeg} onConfirm={noop} onClose={noop} background={null} fillOptions />,
    );

    expect(screen.queryByRole('button', { name: 'None' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'White' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('mints one object URL for the file and revokes it on close', () => {
    // It used to call createObjectURL in the render body, one fresh URL per
    // drag and zoom tick, and Cancel revoked none of them.
    const { rerender, unmount } = render(
      <PhotoCropModal file={file} onConfirm={noop} onClose={noop} />,
    );
    rerender(<PhotoCropModal file={file} onConfirm={noop} onClose={noop} />);

    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(cropperProps.current.image).toBe('blob:emblem');

    unmount();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:emblem');
  });
});
