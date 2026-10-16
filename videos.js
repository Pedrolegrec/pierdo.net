/* Pauses the other videos when one starts playing. */
document.addEventListener('play', (event) => {
  document.querySelectorAll('.video-card video').forEach((video) => {
    if (video !== event.target) video.pause();
  });
}, true);
