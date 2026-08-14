export const createImage = (url: string): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const image = new Image()
    image.addEventListener('load', () => resolve(image))
    image.addEventListener('error', (error) => reject(error))
    image.setAttribute('crossOrigin', 'anonymous') // needed to avoid CORS issues
    image.src = url
  })

export async function getCroppedImg(
  imageSrc: string,
  pixelCrop: { x: number; y: number; width: number; height: number }
): Promise<Blob> {
  const image = await createImage(imageSrc)
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')

  if (!ctx) {
    throw new Error('No 2d context')
  }

  canvas.width = pixelCrop.width
  canvas.height = pixelCrop.height

  // Fill with white background (important for thermal printing)
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)

  // Draw the image at the calculated offset
  // pixelCrop is relative to the original image dimensions, so -pixelCrop positions the image correctly.
  ctx.drawImage(
    image,
    -pixelCrop.x,
    -pixelCrop.y,
    image.naturalWidth,
    image.naturalHeight
  )

  return new Promise((resolve, reject) => {
    canvas.toBlob((file) => {
      if (file) {
        resolve(file)
      } else {
        reject(new Error('Canvas is empty'))
      }
    }, 'image/jpeg')
  })
}
