/**
 * Client-side video compression using MediaRecorder API.
 * Compresses video while maintaining reasonable quality.
 */

export interface CompressionProgress {
  stage: 'loading' | 'compressing' | 'done';
  percent: number;
}

export async function compressVideo(
  file: File,
  onProgress?: (progress: CompressionProgress) => void,
  targetBitrate: number = 1_500_000 // 1.5 Mbps default
): Promise<File> {
  // If file is already small (under 20MB), skip compression
  if (file.size <= 20 * 1024 * 1024) {
    return file;
  }

  // Check browser support
  if (!window.MediaRecorder || !document.createElement('video').canPlayType) {
    console.warn('MediaRecorder not supported, uploading original file');
    return file;
  }

  onProgress?.({ stage: 'loading', percent: 0 });

  return new Promise<File>((resolve, reject) => {
    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;

    const objectUrl = URL.createObjectURL(file);
    video.src = objectUrl;

    video.onloadedmetadata = () => {
      onProgress?.({ stage: 'loading', percent: 30 });

      // Determine output dimensions — cap at 720p to save space
      const maxHeight = 720;
      let width = video.videoWidth;
      let height = video.videoHeight;

      if (height > maxHeight) {
        const scale = maxHeight / height;
        width = Math.round(width * scale);
        height = maxHeight;
      }
      // Ensure even dimensions (required by most codecs)
      width = width % 2 === 0 ? width : width - 1;
      height = height % 2 === 0 ? height : height - 1;

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d')!;

      const stream = canvas.captureStream(24); // 24 fps

      // Try to capture audio from the video
      try {
        const audioCtx = new AudioContext();
        const source = audioCtx.createMediaElementSource(video);
        const dest = audioCtx.createMediaStreamDestination();
        source.connect(dest);
        source.connect(audioCtx.destination);
        dest.stream.getAudioTracks().forEach(track => stream.addTrack(track));
      } catch {
        // No audio or audio capture not supported — continue without audio
      }

      // Choose codec — prefer VP9 for better compression, fallback to VP8, then default
      let mimeType = 'video/webm';
      if (MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus')) {
        mimeType = 'video/webm;codecs=vp9,opus';
      } else if (MediaRecorder.isTypeSupported('video/webm;codecs=vp8,opus')) {
        mimeType = 'video/webm;codecs=vp8,opus';
      } else if (MediaRecorder.isTypeSupported('video/webm')) {
        mimeType = 'video/webm';
      }

      let recorder: MediaRecorder;
      try {
        recorder = new MediaRecorder(stream, {
          mimeType,
          videoBitsPerSecond: targetBitrate,
        });
      } catch {
        // Fallback without codec specification
        recorder = new MediaRecorder(stream, {
          videoBitsPerSecond: targetBitrate,
        });
      }

      const chunks: Blob[] = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };

      recorder.onstop = () => {
        URL.revokeObjectURL(objectUrl);
        onProgress?.({ stage: 'done', percent: 100 });

        const blob = new Blob(chunks, { type: 'video/webm' });

        // If compressed is somehow larger, use original
        if (blob.size >= file.size) {
          resolve(file);
          return;
        }

        const compressedName = file.name.replace(/\.[^.]+$/, '') + '_compressed.webm';
        const compressedFile = new File([blob], compressedName, {
          type: 'video/webm',
          lastModified: Date.now(),
        });
        resolve(compressedFile);
      };

      recorder.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        // On error, return original file
        resolve(file);
      };

      const duration = video.duration;

      video.onplay = () => {
        recorder.start(1000); // collect data every second

        const drawFrame = () => {
          if (video.ended || video.paused) {
            recorder.stop();
            return;
          }

          ctx.drawImage(video, 0, 0, width, height);

          // Update progress
          if (duration && isFinite(duration)) {
            const pct = Math.min(95, Math.round((video.currentTime / duration) * 100));
            onProgress?.({ stage: 'compressing', percent: pct });
          }

          requestAnimationFrame(drawFrame);
        };
        requestAnimationFrame(drawFrame);
      };

      video.onended = () => {
        // Small delay to let last frames flush
        setTimeout(() => {
          if (recorder.state === 'recording') {
            recorder.stop();
          }
        }, 500);
      };

      video.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        resolve(file); // fallback to original
      };

      onProgress?.({ stage: 'loading', percent: 50 });
      video.play().catch(() => resolve(file));
    };

    video.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(file);
    };
  });
}
