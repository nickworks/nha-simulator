const rel=(p,c)=>{
    if(!HTMLElement.prototype.isPrototypeOf(p)) return;
    if(typeof c === 'string') p.innerHTML = c;
    else if(Array.isArray(c)) c.forEach(i => rel(p, i));
    else if(HTMLElement.prototype.isPrototypeOf(c)) p.appendChild(c);
    return p;
};
const child=(p,c)=>{
    rel(p,c);
    return c;
};
const get=(s)=>{
    const parts = s.split(' ').map(p => tagdef(p, '*'));
    let res = [document];
    parts.forEach(p => {
        if(p.id) {
            res = res.map(r => r?.getElementById(p.id));
        } else if(p.classes.length > 0){
            const next = [];
            res.forEach(r => {
                const children = r?.getElementsByClassName(p.classes[0])??[];
                for (c of children) if(next.indexOf(c) === -1) next.push(c);
            });
            res = next;
        } else {
            const next = [];
            res.forEach(r => {
                const children = r?.getElementsByTagName(p.type)??[];
                for(c of children) if(next.indexOf(c) === -1) next.push(c);
            });
            res = next;
        }
        if(p.type!='*') res = res.filter(r => r?.tagName?.match(p.type.toUpperCase()));
        p.classes.forEach(c => res = res.filter(r => r?.classList?.contains(c)));
    });
    return res;
};
const tagdef=(s,t='div')=>{
    if(typeof s !== 'string') return {};
    const regex = /(\.|\#)?([a-zA-Z\_\-0-9]+)/g
    let arr = [];
    const res = {
        type: t,
        id: '',
        classes: [],
        make:function(){
            const e = document.createElement(this.type);
            this.classes.forEach(c => e.classList.add(c));
            if(this.id) e.id = this.id;
            return e;
        },
    };
    while((arr = regex.exec(s)) !== null){
        switch(arr[1]){
            case '.': res.classes.push(arr[2]); break;
            case '#': res.id = arr[2]; break;
            default: res.type = arr[2]; break;
        }
    }
    return res;
};
const tag=(input, content, attributes, debug)=>{
    if(typeof input !== 'string') return null;
    const t = tagdef(input);
    const e = t.make();
    if(!e) return null;
    if(typeof attributes === 'object'){
        for (const [key, value] of Object.entries(attributes)) {
            if(key in e){
                // set event-listeners, properties from prototype chain
                e[key] = value;
            } else {
                // set an attribute on the html element
                e.setAttribute(key, value);
            }
        }
    }
    if(content) rel(e,content);
    return e;
};
const clear=(tag)=>{
    while(tag.childNodes.length > 0){
        tag.removeChild(tag.childNodes[0]);
    }
};