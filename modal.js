// Отримуємо модальне вікно
var modal = document.getElementById("imageModal");

// Отримуємо зображення і модальний контент
var modalImg = document.getElementById("modalImage");

// Отримуємо всі зображення і відео в галереї
var media = document.querySelectorAll(".img_container img, .img_container video");

// Додаємо обробник подій для кожного зображення і відео
media.forEach(function(item) {
  item.onclick = function() {
    if (window.innerWidth < 767) return; // Перевірка розміру екрану

    modal.style.display = "block";
    if (item.tagName === 'VIDEO') {
      modalImg.style.display = 'none';
      var modalVideo = document.createElement('video');
      modalVideo.src = item.src;
      modalVideo.autoplay = true;
      modalVideo.loop = true;
      modalVideo.muted = true;
      modalVideo.style.width = '100%';
      modalVideo.id = 'modalVideo';
      modal.appendChild(modalVideo);
    } else {
      modalImg.src = this.src;
      modalImg.style.display = 'block';
      var modalVideo = document.getElementById('modalVideo');
      if (modalVideo) {
        modal.removeChild(modalVideo);
      }
    }
    modal.classList.remove('fadeOut');
    modal.classList.add('fadeIn');
  }
});

// Отримуємо всі підписи до зображень і відео
var captions = document.querySelectorAll(".img_container figcaption");

// Додаємо обробник подій для кожного підпису
captions.forEach(function(caption) {
  caption.onclick = function() {
    if (window.innerWidth < 767) return; // Перевірка розміру екрану

    var mediaItem = this.previousElementSibling;
    modal.style.display = "block";
    if (mediaItem.tagName === 'VIDEO') {
      modalImg.style.display = 'none';
      var modalVideo = document.createElement('video');
      modalVideo.src = mediaItem.src;
      modalVideo.autoplay = true;
      modalVideo.loop = true;
      modalVideo.muted = true;
      modalVideo.style.width = '100%';
      modalVideo.id = 'modalVideo';
      modal.appendChild(modalVideo);
    } else {
      modalImg.src = mediaItem.src;
      modalImg.style.display = 'block';
      var modalVideo = document.getElementById('modalVideo');
      if (modalVideo) {
        modal.removeChild(modalVideo);
      }
    }
    modal.classList.remove('fadeOut');
    modal.classList.add('fadeIn');
  }
});

// Отримуємо елемент для закриття модального вікна
var span = document.getElementsByClassName("close")[0];

// Закриваємо модальне вікно при натисканні на "x"
span.onclick = function() {
  modal.classList.remove('fadeIn');
  modal.classList.add('fadeOut');
  setTimeout(function() {
    modal.style.display = "none";
    var modalVideo = document.getElementById('modalVideo');
    if (modalVideo) {
      modal.removeChild(modalVideo);
    }
  }, 500); // Час, що відповідає тривалості анімації
}

// Закриваємо модальне вікно при натисканні на область поза зображенням
modal.onclick = function(event) {
  if (event.target === modal) {
    modal.classList.remove('fadeIn');
    modal.classList.add('fadeOut');
    setTimeout(function() {
      modal.style.display = "none";
      var modalVideo = document.getElementById('modalVideo');
      if (modalVideo) {
        modal.removeChild(modalVideo);
      }
    }, 500); // Час, що відповідає тривалості анімації
  }
}

// Додаємо обробник подій для завершення анімації
modal.addEventListener('animationend', function(event) {
  if (event.animationName === 'fadeOut') {
    modal.style.display = 'none';
    var modalVideo = document.getElementById('modalVideo');
    if (modalVideo) {
      modal.removeChild(modalVideo);
    }
  }
});