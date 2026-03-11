import { useEffect, useRef, useState } from 'react'
import { Html5QrcodeScanner, Html5QrcodeScanType } from 'html5-qrcode'

interface QRScannerProps {
  onScan: (data: string) => void
  onError?: (error: string) => void
}

export default function QRScanner({ onScan, onError }: QRScannerProps) {
  const scannerRef = useRef<Html5QrcodeScanner | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [scanning, setScanning] = useState(true)

  useEffect(() => {
    if (!scanning || !containerRef.current) return

    const scannerId = 'qr-scanner-container'

    const scanner = new Html5QrcodeScanner(
      scannerId,
      {
        fps: 10,
        qrbox: { width: 250, height: 250 },
        supportedScanTypes: [Html5QrcodeScanType.SCAN_TYPE_CAMERA],
        rememberLastUsedCamera: true,
      },
      false
    )

    scannerRef.current = scanner

    scanner.render(
      (decodedText) => {
        scanner.clear().catch(() => {})
        scannerRef.current = null
        setScanning(false)
        onScan(decodedText)
      },
      (errorMessage) => {
        // html5-qrcode fires this continuously while scanning — only report real errors
        if (errorMessage.includes('NotAllowedError') || errorMessage.includes('NotFoundError')) {
          onError?.(errorMessage)
        }
      }
    )

    return () => {
      if (scannerRef.current) {
        scannerRef.current.clear().catch(() => {})
        scannerRef.current = null
      }
    }
  }, [scanning, onScan, onError])

  const handleRestart = () => {
    setScanning(true)
  }

  return (
    <div>
      {scanning ? (
        <div id="qr-scanner-container" ref={containerRef} />
      ) : (
        <div className="empty-state">
          <p>Scanner stopped</p>
          <button className="btn btn-secondary" onClick={handleRestart} style={{ marginTop: '0.5rem' }}>
            Scan Again
          </button>
        </div>
      )}
    </div>
  )
}
