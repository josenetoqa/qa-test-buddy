const form=document.querySelector('#demo-form');const message=document.querySelector('#message');
form.addEventListener('submit',event=>{event.preventDefault();const email=form.elements.email.value.trim();message.textContent=!email?'Enter an email address':/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)?'Contact created':'Enter a valid email address';message.dataset.status=message.textContent==='Contact created'?'passed':'error';});
form.addEventListener('reset',()=>{message.textContent='';message.removeAttribute('data-status');});
