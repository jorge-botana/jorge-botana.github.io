toggleBtn.addEventListener('click', function () {
    input.type = input.type === 'password' ? 'text' : 'password';
    this.textContent = input.type === 'password' ? 'Show' : 'Hide';
});


//  toggleBtn.addEventListener('mousedown', () => {
//      input.type = 'text';
//      toggleBtn.textContent = 'Hide';
//  });
//
//  toggleBtn.addEventListener('mouseup', () => {
//      input.type = 'password';
//      toggleBtn.textContent = 'Show';
//  });
//
//  toggleBtn.addEventListener('mouseleave', () => {
//      // En caso de que el mouse salga del botón mientras está presionado
//      input.type = 'password';
//      toggleBtn.textContent = 'Show';
//  });
//
//  // Para dispositivos táctiles
//  toggleBtn.addEventListener('touchstart', (e) => {
//      e.preventDefault(); // evita que se active el click también
//      input.type = 'text';
//      toggleBtn.textContent = 'Hide';
//  });
//
//  toggleBtn.addEventListener('touchend', () => {
//      input.type = 'password';
//      toggleBtn.textContent = 'Show';
//  });
