import QRCode from 'qrcode';

export type QrMatrix = boolean[][];

/**
 * Tạo ma trận boolean 2D của mã QR sử dụng thư viện chuẩn `qrcode` (ISO/IEC 18004).
 * Error correction level M, tự động chọn version và mask tối ưu nhất để tất cả camera
 * điện thoại (iOS, Android, Zalo, app ngân hàng) đều quét được ngay lập tức.
 */
export function generateQrMatrix(text: string): QrMatrix {
  const qr = QRCode.create(text, { errorCorrectionLevel: 'M' });
  const size = qr.modules.size;
  const matrix: boolean[][] = [];
  for (let r = 0; r < size; r++) {
    const row: boolean[] = [];
    for (let c = 0; c < size; c++) {
      row.push(qr.modules.get(r, c) === 1);
    }
    matrix.push(row);
  }
  return matrix;
}

export interface QrSvgOptions {
  margin?: number; // Quiet zone tính theo số module (chuẩn ISO là 4)
  fgColor?: string; // Màu module tối (mặc định: #1D2522)
  bgColor?: string; // Màu nền (mặc định: #FFFFFF)
  size?: number; // Kích thước hiển thị pixel (viewBox tự co giãn theo tỷ lệ)
}

/**
 * Chuyển đổi ma trận QR thành chuỗi SVG vector sắc nét, hỗ trợ in ấn và phóng to không vỡ hạt.
 */
export function matrixToSvg(matrix: QrMatrix, options: QrSvgOptions = {}): string {
  const {
    margin = 4,
    fgColor = '#1D2522',
    bgColor = '#FFFFFF',
    size = 280,
  } = options;

  const moduleCount = matrix.length;
  const totalSize = moduleCount + margin * 2;

  // Xây dựng path SVG với các khối đơn vị hình vuông
  let pathD = '';
  for (let r = 0; r < moduleCount; r++) {
    for (let c = 0; c < moduleCount; c++) {
      if (matrix[r][c]) {
        const x = c + margin;
        const y = r + margin;
        pathD += `M${x},${y}h1v1h-1z `;
      }
    }
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${totalSize} ${totalSize}" width="${size}" height="${size}" shape-rendering="crispEdges">
  <rect width="100%" height="100%" fill="${bgColor}"/>
  <path d="${pathD.trim()}" fill="${fgColor}"/>
</svg>`;
}

/**
 * Chuẩn hóa tên file xuất SVG/PNG an toàn, loại bỏ dấu tiếng Việt và ký tự đặc biệt.
 */
export function sanitizeQrFilename(name: string, ext: 'svg' | 'png'): string {
  const clean = name
    .replace(/[đĐ]/g, (m) => (m === 'đ' ? 'd' : 'D'))
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
  return `${clean || 'QR_Code'}.${ext}`;
}

/**
 * Tải file SVG mã QR về máy khách
 */
export function downloadSvgString(svgContent: string, filename: string): void {
  const blob = new Blob([svgContent], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = sanitizeQrFilename(filename, 'svg');
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Tải file PNG mã QR chất lượng cao (1024x1024px) về máy khách
 */
export async function downloadPngFromMatrix(
  matrix: QrMatrix,
  filename: string,
  pixelSize = 1024,
  margin = 4
): Promise<void> {
  const moduleCount = matrix.length;
  const totalModules = moduleCount + margin * 2;
  const modulePx = Math.floor(pixelSize / totalModules);
  const actualSize = modulePx * totalModules;

  const canvas = document.createElement('canvas');
  canvas.width = actualSize;
  canvas.height = actualSize;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  // Nền trắng
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, actualSize, actualSize);

  // Module tối
  ctx.fillStyle = '#1D2522';
  for (let r = 0; r < moduleCount; r++) {
    for (let c = 0; c < moduleCount; c++) {
      if (matrix[r][c]) {
        ctx.fillRect(
          (c + margin) * modulePx,
          (r + margin) * modulePx,
          modulePx,
          modulePx
        );
      }
    }
  }

  return new Promise((resolve) => {
    canvas.toBlob((blob) => {
      if (blob) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = sanitizeQrFilename(filename, 'png');
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }
      resolve();
    }, 'image/png');
  });
}
