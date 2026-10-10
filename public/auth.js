const $=id=>document.getElementById(id);
let mode='login';

function profileUI(profile){
  $('profile').textContent=profile?.guest?'Guest studio ↗':profile?`${profile.name}'s studio ↗`:'Enter studio ↗';
}

function setMode(next){
  mode=next;
  const registering=mode==='register';
  $('loginMode').classList.toggle('selected',!registering);
  $('registerMode').classList.toggle('selected',registering);
  $('loginMode').setAttribute('aria-selected',String(!registering));
  $('registerMode').setAttribute('aria-selected',String(registering));
  $('authTitle').textContent=registering?'Create your account':'Log in';
  $('authDescription').textContent=registering?'Choose a username and password to save your studio in this browser.':'Log in to continue your drawing practice.';
  $('accountIdentifierLabel').textContent=registering?'Username':'Username or email';
  $('accountUsername').placeholder=registering?'Choose a username':'Username or email';
  $('emailField').hidden=!registering;
  $('accountPassword').autocomplete=registering?'new-password':'current-password';
  $('authSubmit').textContent=registering?'Create account':'Log in';
  $('authMessage').textContent='';
}

function getAccounts(){
  try{return JSON.parse(localStorage.getItem('sketch-accounts')||'[]');}catch{return [];}
}

async function hashPassword(password,salt){
  const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(password),'PBKDF2',false,['deriveBits']);
  const bits=await crypto.subtle.deriveBits({name:'PBKDF2',salt,iterations:210000,hash:'SHA-256'},key,256);
  return btoa(String.fromCharCode(...new Uint8Array(bits)));
}

async function makePasswordRecord(password){
  const salt=crypto.getRandomValues(new Uint8Array(16));
  return {salt:btoa(String.fromCharCode(...salt)),hash:await hashPassword(password,salt)};
}

function openLogin(){
  const cover=$('cover');
  cover?.classList.add('hidden');
  const current=JSON.parse(localStorage.getItem('sketch-profile')||'null');
  setMode('login');
  $('accountUsername').value=current?.guest?'':current?.name||'';
  $('accountPassword').value='';
  $('login').showModal();
  $('accountUsername').focus();
}

$('profile').onclick=openLogin;
$('loginCoverBtn').onclick=openLogin;
$('showCoverBtn').onclick=()=>{
  if($('login').open)$('login').close();
  $('cover').classList.remove('hidden');
};
$('closeLogin').onclick=()=>$('login').close();
$('loginMode').onclick=()=>setMode('login');
$('registerMode').onclick=()=>setMode('register');
$('guestCoverBtn').onclick=()=>{
  const profile={name:'Guest',guest:true};
  localStorage.setItem('sketch-profile',JSON.stringify(profile));
  profileUI(profile);
  $('cover').classList.add('hidden');
};
$('loginForm').onsubmit=async event=>{
  event.preventDefault();
  const identifier=$('accountUsername').value.trim();
  const password=$('accountPassword').value;
  const email=$('accountEmail').value.trim();
  const accounts=getAccounts();
  const existing=accounts.find(account=>account.username.toLowerCase()===identifier.toLowerCase()||(mode==='login'&&account.email&&account.email.toLowerCase()===identifier.toLowerCase()));
  const message=$('authMessage');
  $('authSubmit').disabled=true;
  message.textContent=mode==='register'?'Creating your account…':'Checking your login…';
  try{
    if(!identifier||!password)throw Error('Enter your username or email and password.');
    if(mode==='register'){
      if(password.length<8)throw Error('Use a password with at least 8 characters.');
      if(existing)throw Error('That username is already registered in this browser.');
      const record=await makePasswordRecord(password);
      accounts.push({username:identifier,email,salt:record.salt,passwordHash:record.hash});
      localStorage.setItem('sketch-accounts',JSON.stringify(accounts));
    }else{
      if(!existing)throw Error('No account with that username or email was found in this browser.');
      const salt=Uint8Array.from(atob(existing.salt),character=>character.charCodeAt(0));
      if(await hashPassword(password,salt)!==existing.passwordHash)throw Error('That password is incorrect.');
    }
    const profile={name:existing?.username||identifier,guest:false};
    localStorage.setItem('sketch-profile',JSON.stringify(profile));
    profileUI(profile);
    $('cover').classList.add('hidden');
    $('login').close();
  }catch(error){
    message.textContent=error.message==='The operation is insecure.'?'Account security is unavailable here. Open the app on localhost and try again.':error.message||'Could not complete account access.';
  }finally{
    $('authSubmit').disabled=false;
  }
};

setMode('login');
try{profileUI(JSON.parse(localStorage.getItem('sketch-profile')||'null'));}catch{profileUI(null);}
