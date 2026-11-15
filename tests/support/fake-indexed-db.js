const databases=new Map();
const clone=value=>value===undefined?undefined:structuredClone(value);
const keyFor=(value,keyPath)=>JSON.stringify(Array.isArray(keyPath)?keyPath.map(path=>path.split('.').reduce((node,key)=>node?.[key],value)):keyPath.split('.').reduce((node,key)=>node?.[key],value));
class Request{
  constructor(){this.result=undefined;this.error=null;this.onsuccess=null;this.onerror=null;}
  success(value){this.result=clone(value);queueMicrotask(()=>this.onsuccess?.({target:this}));}
  fail(error){this.error=error;queueMicrotask(()=>this.onerror?.({target:this}));}
}
class ObjectStore{
  constructor(transaction,name){this.transaction=transaction;this.name=name;this.schema=transaction.database.schemas.get(name);}
  createIndex(name,keyPath){this.schema.indexes.set(name,keyPath);}
  index(name){const keyPath=this.schema.indexes.get(name);if(!keyPath)throw new Error('Unknown index '+name);return new Index(this.transaction,this.name,keyPath);}
  get(key){return this.transaction.request(this.name,store=>store.get(JSON.stringify(key)));}
  getAll(query){return this.transaction.request(this.name,store=>[...store.values()].filter(value=>query===undefined||JSON.stringify(value[this.schema.keyPath])===JSON.stringify(query)));}
  put(value){return this.write(value,false);}
  add(value){return this.write(value,true);}
  write(value,addOnly){return this.transaction.request(this.name,store=>{const key=keyFor(value,this.schema.keyPath);if(addOnly&&store.has(key)){const error=new DOMException('Key already exists.','ConstraintError');this.transaction.abort(error);throw error;}store.set(key,clone(value));return JSON.parse(key);},addOnly?'add':'put');}
  delete(key){return this.transaction.request(this.name,store=>{store.delete(JSON.stringify(key));return undefined;});}
  clear(){return this.transaction.request(this.name,store=>{store.clear();return undefined;});}
}
class Index{
  constructor(transaction,storeName,keyPath){this.transaction=transaction;this.storeName=storeName;this.keyPath=keyPath;}
  getAll(query){return this.transaction.request(this.storeName,store=>[...store.values()].filter(value=>JSON.stringify(this.keyPath.split('.').reduce((node,key)=>node?.[key],value))===JSON.stringify(query)));}
}
class Transaction{
  constructor(database,names,mode,factory){this.database=database;this.mode=mode;this.factory=factory;this.aborted=false;this.completed=false;this.pending=0;this.completionScheduled=false;this.onerror=null;this.onabort=null;this.oncomplete=null;this.error=null;this.snapshot=new Map();for(const name of names)this.snapshot.set(name,mode==='readwrite'?new Map([...database.stores.get(name)].map(([key,value])=>[key,clone(value)])):database.stores.get(name));setTimeout(()=>this.maybeComplete(),0);}
  objectStore(name){if(!this.snapshot.has(name))throw new Error('Object store not in transaction: '+name);return new ObjectStore(this,name);}
  request(name,operation,writeType='read'){const request=new Request();if(this.completed||this.aborted){request.fail(this.error||new Error('Transaction inactive.'));return request;}this.pending++;setTimeout(()=>{if(this.aborted){this.pending--;request.fail(this.error||new Error('Transaction aborted.'));this.maybeComplete();return;}try{if(this.factory.failNextWrite&&this.mode==='readwrite'&&this.factory.failNextWrite.store===name&&this.factory.failNextWrite.operation===writeType){const failure=this.factory.failNextWrite.error;this.factory.failNextWrite=null;this.abort(failure);throw failure;}const result=operation(this.snapshot.get(name));request.success(result);}catch(error){request.fail(error);}finally{this.pending--;this.maybeComplete();}},0);return request;}
  abort(error=new DOMException('Transaction aborted.','AbortError')){if(this.completed||this.aborted)return;this.aborted=true;this.error=error;queueMicrotask(()=>this.onabort?.({target:this}));}
  maybeComplete(){if(this.completed||this.aborted||this.pending||this.completionScheduled)return;this.completionScheduled=true;setTimeout(()=>{this.completionScheduled=false;if(this.completed||this.aborted||this.pending)return;this.completed=true;if(this.mode==='readwrite')for(const[name,store]of this.snapshot)this.database.stores.set(name,store);queueMicrotask(()=>this.oncomplete?.({target:this}));},0);}
}
class Database{
  constructor(name,version,factory){this.name=name;this.version=version;this.factory=factory;this.stores=new Map();this.schemas=new Map();this.objectStoreNames={contains:name=>this.stores.has(name)};this.onversionchange=null;}
  createObjectStore(name,{keyPath}){if(this.stores.has(name))throw new DOMException('Store exists.','ConstraintError');this.stores.set(name,new Map());this.schemas.set(name,{keyPath,indexes:new Map()});return new ObjectStore(new Transaction(this,[name],'versionchange',this.factory),name);}
  transaction(names,mode='readonly'){if(typeof names==='string')names=[names];for(const name of names)if(!this.stores.has(name))throw new DOMException('Unknown store.','NotFoundError');return new Transaction(this,names,mode,this.factory);}
  close(){}
}
export class FakeIndexedDB{
  failNextWrite=null;
  open(name,version=1){const request=new Request();setTimeout(()=>{let db=databases.get(name),isNew=!db,oldVersion=db?.version||0;if(!db){db=new Database(name,version,this);databases.set(name,db);}request.result=db;if(isNew||version>db.version){db.version=version;request.onupgradeneeded?.({target:request,oldVersion,newVersion:version});}queueMicrotask(()=>request.onsuccess?.({target:request}));},0);return request;}
  deleteDatabase(name){databases.delete(name);}
  inspect(name){return databases.get(name)||null;}
}
