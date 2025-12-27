const promise1 = new Promise((rs)=>{
	rs();
	console.log('test')
});

const promise2 = promise1.then(()=>{
	console.log('xixi')
	return true
})

console.log('???')
setTimeout(()=>{
	console.log(promise2)
},0)