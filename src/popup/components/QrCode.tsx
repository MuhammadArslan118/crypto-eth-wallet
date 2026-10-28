import React, { useEffect, useState } from 'react';
import QRCode from 'qrcode';

export function QrCode({ value, size = 180 }: { value: string; size?: number }) {
  const [src, setSrc] = useState('');

  useEffect(() => {
    QRCode.toDataURL(value, { width: size, margin: 1 }).then(setSrc).catch(() => setSrc(''));
  }, [value, size]);

  return (
    <div style={{ alignSelf: 'center', width: size, height: size, background: '#fff', borderRadius: '8px', padding: '6px', boxSizing: 'content-box' }}>
      {src && <img src={src} alt="Address QR code" width={size} height={size} style={{ display: 'block' }} />}
    </div>
  );
}
