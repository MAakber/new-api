package service

import (
	"bytes"
	"errors"
	"image"
	"image/png"
	"math"

	xdraw "golang.org/x/image/draw"
)

const (
	AvatarContentType   = "image/png"
	avatarOutputMaxEdge = 512
	AvatarMaxBytes      = 2 << 20
)

// NormalizeAvatarImage re-encodes an accepted image as a bounded PNG. The
// standard-library encoder avoids retaining user-supplied metadata, while the
// resize bound keeps avatar storage and response sizes predictable.
func NormalizeAvatarImage(source image.Image) ([]byte, int, int, error) {
	if source == nil {
		return nil, 0, 0, errors.New("avatar image is nil")
	}

	bounds := source.Bounds()
	width, height := bounds.Dx(), bounds.Dy()
	if width <= 0 || height <= 0 {
		return nil, 0, 0, errors.New("avatar image dimensions are invalid")
	}

	targetWidth, targetHeight := avatarOutputDimensions(width, height)
	target := image.NewNRGBA(image.Rect(0, 0, targetWidth, targetHeight))
	xdraw.ApproxBiLinear.Scale(target, target.Bounds(), source, bounds, xdraw.Src, nil)

	var encoded bytes.Buffer
	if err := png.Encode(&encoded, target); err != nil {
		return nil, 0, 0, err
	}
	if encoded.Len() > AvatarMaxBytes {
		return nil, 0, 0, errors.New("normalized avatar is too large")
	}
	return encoded.Bytes(), targetWidth, targetHeight, nil
}

func avatarOutputDimensions(width, height int) (int, int) {
	if width <= avatarOutputMaxEdge && height <= avatarOutputMaxEdge {
		return width, height
	}
	scale := math.Min(
		float64(avatarOutputMaxEdge)/float64(width),
		float64(avatarOutputMaxEdge)/float64(height),
	)
	targetWidth := max(1, int(math.Round(float64(width)*scale)))
	targetHeight := max(1, int(math.Round(float64(height)*scale)))
	return targetWidth, targetHeight
}
