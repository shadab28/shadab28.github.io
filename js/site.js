// Small site interactions: smooth scroll for anchor links, collapse mobile nav on click
document.addEventListener('DOMContentLoaded', function(){
  // Smooth scroll for internal links
  document.querySelectorAll('a[href^="#"]').forEach(function(anchor){
    anchor.addEventListener('click', function(e){
      var target = document.querySelector(this.getAttribute('href'));
      if(target){
        e.preventDefault();
        target.scrollIntoView({behavior:'smooth', block:'start'});
      }
    });
  });

  // Collapse navbar (Bootstrap) on link click for small screens
  var navLinks = document.querySelectorAll('.navbar-collapse .nav-link');
  var navCollapse = document.querySelector('.navbar-collapse');
  navLinks.forEach(function(link){
    link.addEventListener('click', function(){
      if(window.getComputedStyle(document.querySelector('.navbar-toggler')).display !== 'none'){
        // bootstrap collapse toggle
        var bsCollapse = new bootstrap.Collapse(navCollapse, {toggle:false});
        bsCollapse.hide();
      }
    });
  });
});
