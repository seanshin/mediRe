// Main page functionality
console.log('메디케어 AI 홈페이지 로드 완료');

// Smooth scrolling for anchor links
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
  anchor.addEventListener('click', function (e) {
    e.preventDefault();
    const target = document.querySelector(this.getAttribute('href'));
    if (target) {
      target.scrollIntoView({ behavior: 'smooth' });
    }
  });
});

// Redirect dashboard link to actual dashboard page
document.querySelectorAll('a[href="#dashboard"]').forEach(link => {
  link.addEventListener('click', function(e) {
    e.preventDefault();
    window.location.href = '/dashboard';
  });
});
