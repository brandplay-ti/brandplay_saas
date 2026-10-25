import sys,collections,re
def load(p):
    d=collections.defaultdict(dict)
    for line in open(p,encoding='utf-8'):
        parts=line.rstrip('\n').split('|')
        if len(parts)<2: continue
        k=parts[0]
        if k in ('policy',): key=parts[1]+' '+parts[2]; val=parts[3]
        elif k in ('constraint','index'): key=parts[1]+' :: '+'|'.join(parts[2:]); val=''
        else: key=parts[1]; val='|'.join(parts[2:])
        d[k][key]=val
    return d
L=load(sys.argv[1]); R=load(sys.argv[2])
sec=sys.argv[3] if len(sys.argv)>3 else None
for k in (sec,) if sec else ('table','column','enum','function','trigger','view','bucket'):
    l,r=L[k],R[k]
    onlyL=sorted(set(l)-set(r)); onlyR=sorted(set(r)-set(l)); diff=sorted(x for x in set(l)&set(r) if l[x]!=r[x])
    print(f"== {k}: so no lovable={len(onlyL)} so no repo={len(onlyR)} diferentes={len(diff)}")
    for x in onlyL[:60]: print("  L+", x, '->', l[x][:110])
    for x in onlyR[:40]: print("  R+", x, '->', r[x][:110])
    for x in diff[:60]: print("  ~ ", x, '| L:', l[x][:90], '| R:', r[x][:90])
