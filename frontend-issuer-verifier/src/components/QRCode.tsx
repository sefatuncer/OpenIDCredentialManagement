import { QRCodeSVG } from 'qrcode.react';

interface QRCodeProps {
  data: string;
  size?: number;
  label?: string;
}

export function QRCode({ data, size = 256, label }: QRCodeProps) {
  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(data);
    } catch (err) {
      console.error('Copy error:', err);
    }
  };

  return (
    <div className="qr-container">
      <QRCodeSVG
        value={data}
        size={size}
        level="M"
        includeMargin={true}
        bgColor="#ffffff"
        fgColor="#000000"
      />
      {label && <div className="qr-label">{label}</div>}
      <button
        className="copy-btn"
        onClick={copyToClipboard}
        style={{ marginTop: '1rem' }}
      >
        📋 Copy URI
      </button>
    </div>
  );
}
