document.addEventListener('DOMContentLoaded', function () {
  const toggle = document.getElementById('toggle-color-scheme');
  if (localStorage.getItem('checked') === 'true') {
    toggle.checked = true;
  } else {
    toggle.checked = false;
  }
  toggle.addEventListener('change', function () {
    localStorage.setItem('checked', this.checked);
  });
});
