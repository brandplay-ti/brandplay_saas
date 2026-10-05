import subprocess,sys,json
def q(db, sql):
    r=subprocess.run(['docker','exec','-i',f'recon-{db}','psql','-U','supabase_admin','-d','postgres','-At','-F','\x1f','-R','\x1e','-c',sql],capture_output=True,text=True,encoding='utf-8')
    if r.returncode: raise SystemExit(r.stderr)
    out=r.stdout.rstrip('\n').rstrip('\x1e')
    return [row.split('\x1f') for row in out.split('\x1e') if row!=''] if out else []
