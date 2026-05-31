import React from 'react'

export default function VideoPlayer({ stream, label, muted = false }) {
  const videoRef = React.useRef(null)

  React.useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream
      videoRef.current.muted = muted
    }
  }, [stream, muted])

  return (
    <div className="video-container">
      <video ref={videoRef} autoPlay playsInline muted={muted} />
      {label && <span className="video-label">{label}</span>}
    </div>
  )
}
