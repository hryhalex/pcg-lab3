let originalImage = null;
let processedImage = null;

const upload = document.getElementById("upload");
const originalCanvas = document.getElementById("originalCanvas");
const processedCanvas = document.getElementById("processedCanvas");
const modal = document.getElementById("imageModal");
const modalImg = document.getElementById("modalImage");
const captionText = document.getElementById("caption");
const closeBtn = document.getElementsByClassName("close")[0];

upload.addEventListener("change", loadImage);

originalCanvas.addEventListener("click", function () {
  if (!originalImage) return;
  openModal(originalCanvas, "Оригинальное изображение");
});

processedCanvas.addEventListener("click", function () {
  if (!processedImage) return;
  openModal(processedCanvas, "Обработанное изображение");
});

function loadImage(e) {
  const file = e.target.files[0];
  if (!file) return;
  const img = new Image();
  const reader = new FileReader();

  reader.onload = function (event) {
    img.onload = function () {
      originalCanvas.width = img.width;
      originalCanvas.height = img.height;
      processedCanvas.width = img.width;
      processedCanvas.height = img.height;

      const ctx = originalCanvas.getContext("2d");
      ctx.drawImage(img, 0, 0);
      originalImage = ctx.getImageData(0, 0, img.width, img.height);
      processedImage = ctx.getImageData(0, 0, img.width, img.height);
      updateProcessedCanvas();
    };
    img.src = event.target.result;
  };
  reader.readAsDataURL(file);
}

function updateProcessedCanvas() {
  const ctx = processedCanvas.getContext("2d");
  ctx.putImageData(processedImage, 0, 0);
}

function openModal(canvas, title) {
  const dataURL = canvas.toDataURL();
  modal.style.display = "block";
  modalImg.src = dataURL;
  captionText.innerHTML = title;
}

function closeModal() {
  modal.style.display = "none";
}

window.onclick = function (event) {
  if (event.target == modal) {
    modal.style.display = "none";
  }
};

function applyLowPassFilter() {
  if (!originalImage) return;
  const width = originalImage.width;
  const height = originalImage.height;
  const srcData = originalImage.data;
  const dstData = new Uint8ClampedArray(srcData.length);

  const kernel = [
    [1 / 9, 1 / 9, 1 / 9],
    [1 / 9, 1 / 9, 1 / 9],
    [1 / 9, 1 / 9, 1 / 9],
  ];

  const kSize = 1;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let r = 0,
        g = 0,
        b = 0;
      for (let ky = -kSize; ky <= kSize; ky++) {
        for (let kx = -kSize; kx <= kSize; kx++) {
          const ny = y + ky;
          const nx = x + kx;
          if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
            const pos = (ny * width + nx) * 4;
            const weight = kernel[ky + kSize][kx + kSize];
            r += srcData[pos] * weight;
            g += srcData[pos + 1] * weight;
            b += srcData[pos + 2] * weight;
          }
        }
      }
      const idx = (y * width + x) * 4;
      dstData[idx] = r;
      dstData[idx + 1] = g;
      dstData[idx + 2] = b;
      dstData[idx + 3] = srcData[idx + 3];
    }
  }

  processedImage.data.set(dstData);
  updateProcessedCanvas();
}

function applyOtsuThreshold() {
  if (!originalImage) return;
  const width = originalImage.width;
  const height = originalImage.height;
  const srcData = originalImage.data;
  const dstData = new Uint8ClampedArray(srcData.length);

  const histogram = new Array(256).fill(0);
  for (let i = 0; i < srcData.length; i += 4) {
    const gray = rgbToGray(srcData[i], srcData[i + 1], srcData[i + 2]);
    histogram[gray]++;
  }

  let total = width * height;
  let sum = 0;
  for (let t = 0; t < 256; t++) sum += t * histogram[t];

  let sumB = 0;
  let wB = 0;
  let wF = 0;
  let varMax = 0;
  let threshold = 0;

  for (let t = 0; t < 256; t++) {
    wB += histogram[t];
    if (wB === 0) continue;
    wF = total - wB;
    if (wF === 0) break;

    sumB += t * histogram[t];
    let mB = sumB / wB;
    let mF = (sum - sumB) / wF;

    let varBetween = wB * wF * (mB - mF) * (mB - mF);
    if (varBetween > varMax) {
      varMax = varBetween;
      threshold = t;
    }
  }

  for (let i = 0; i < srcData.length; i += 4) {
    const gray = rgbToGray(srcData[i], srcData[i + 1], srcData[i + 2]);
    const value = gray >= threshold ? 255 : 0;
    dstData[i] = dstData[i + 1] = dstData[i + 2] = value;
    dstData[i + 3] = srcData[i + 3];
  }

  processedImage.data.set(dstData);
  updateProcessedCanvas();
}

function applyAdaptiveMeanThreshold() {
  if (!originalImage) return;
  const width = originalImage.width;
  const height = originalImage.height;
  const srcData = originalImage.data;
  const dstData = new Uint8ClampedArray(srcData.length);

  const kSize = 15;
  const halfK = Math.floor(kSize / 2);

  const integral = [];
  for (let y = 0; y < height; y++) {
    integral[y] = [];
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      const gray = rgbToGray(srcData[idx], srcData[idx + 1], srcData[idx + 2]);
      const above = y > 0 ? integral[y - 1][x] : 0;
      const left = x > 0 ? integral[y][x - 1] : 0;
      const aboveLeft = y > 0 && x > 0 ? integral[y - 1][x - 1] : 0;
      integral[y][x] = gray + left + above - aboveLeft;
    }
  }

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const x1 = Math.max(x - halfK, 0);
      const x2 = Math.min(x + halfK, width - 1);
      const y1 = Math.max(y - halfK, 0);
      const y2 = Math.min(y + halfK, height - 1);
      const count = (x2 - x1 + 1) * (y2 - y1 + 1);

      const sum =
        integral[y2][x2] -
        (y1 > 0 ? integral[y1 - 1][x2] : 0) -
        (x1 > 0 ? integral[y2][x1 - 1] : 0) +
        (y1 > 0 && x1 > 0 ? integral[y1 - 1][x1 - 1] : 0);
      const idx = (y * width + x) * 4;
      const gray = rgbToGray(srcData[idx], srcData[idx + 1], srcData[idx + 2]);
      const threshold = (sum / count) * 0.9; // Коэффициент 0.9 для небольшого сдвига

      const value = gray >= threshold ? 255 : 0;
      dstData[idx] = dstData[idx + 1] = dstData[idx + 2] = value;
      dstData[idx + 3] = srcData[idx + 3];
    }
  }

  processedImage.data.set(dstData);
  updateProcessedCanvas();
}

function applyAdaptiveThreshold() {
  if (!originalImage) return;
  const width = originalImage.width;
  const height = originalImage.height;
  const srcData = originalImage.data;
  const dstData = new Uint8ClampedArray(srcData.length);

  const kSize = 15;
  const halfK = Math.floor(kSize / 2);
  const contrastThreshold = 15;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let sum = 0;
      let count = 0;
      let min = 255;
      let max = 0;

      for (let ky = -halfK; ky <= halfK; ky++) {
        for (let kx = -halfK; kx <= halfK; kx++) {
          const ny = y + ky;
          const nx = x + kx;
          if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
            const idx = (ny * width + nx) * 4;
            const gray = rgbToGray(
              srcData[idx],
              srcData[idx + 1],
              srcData[idx + 2]
            );
            sum += gray;
            count++;
            if (gray < min) min = gray;
            if (gray > max) max = gray;
          }
        }
      }

      const mean = sum / count;
      const contrast = max - min;
      const idx = (y * width + x) * 4;
      if (contrast < contrastThreshold) {
        dstData[idx] = dstData[idx + 1] = dstData[idx + 2] = 255;
      } else {
        const gray = rgbToGray(
          srcData[idx],
          srcData[idx + 1],
          srcData[idx + 2]
        );
        const value = gray >= mean ? 255 : 0;
        dstData[idx] = dstData[idx + 1] = dstData[idx + 2] = value;
      }
      dstData[idx + 3] = srcData[idx + 3];
    }
  }

  processedImage.data.set(dstData);
  updateProcessedCanvas();
}

function rgbToGray(r, g, b) {
  return Math.floor(0.299 * r + 0.587 * g + 0.114 * b);
}

function clamp(value) {
  return Math.max(0, Math.min(255, value));
}