package service

import (
	"bytes"
	"image"
	"image/color"
	"image/png"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestNormalizeAvatarImageProducesBoundedPNG(t *testing.T) {
	for _, size := range []image.Point{{X: 64, Y: 64}, {X: 512, Y: 512}} {
		source := image.NewNRGBA(image.Rectangle{Max: size})
		for y := 0; y < size.Y; y++ {
			for x := 0; x < size.X; x++ {
				source.SetNRGBA(x, y, color.NRGBA{R: 12, G: 34, B: 56, A: uint8((x + y) % 256)})
			}
		}

		encoded, width, height, err := NormalizeAvatarImage(source)
		require.NoError(t, err)
		assert.LessOrEqual(t, len(encoded), AvatarMaxBytes)
		assert.Equal(t, size.X, width)
		assert.Equal(t, size.Y, height)

		decoded, err := png.Decode(bytes.NewReader(encoded))
		require.NoError(t, err)
		assert.Equal(t, size.X, decoded.Bounds().Dx())
		assert.Equal(t, size.Y, decoded.Bounds().Dy())
	}
}

func TestNormalizeAvatarImageDownscalesLargeImages(t *testing.T) {
	source := image.NewNRGBA(image.Rect(0, 0, 2048, 1024))
	for y := 0; y < 1024; y++ {
		for x := 0; x < 2048; x++ {
			source.SetNRGBA(x, y, color.NRGBA{R: 200, G: 100, B: 50, A: 96})
		}
	}
	encoded, width, height, err := NormalizeAvatarImage(source)
	require.NoError(t, err)
	assert.Equal(t, 512, width)
	assert.Equal(t, 256, height)
	assert.NotEmpty(t, encoded)
	decoded, err := png.Decode(bytes.NewReader(encoded))
	require.NoError(t, err)
	_, _, _, alpha := decoded.At(256, 128).RGBA()
	assert.NotZero(t, alpha)
}
