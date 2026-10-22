import json, random, datetime
random.seed(7)
now=datetime.datetime(2026,10,22,9,0)
def seed():
    games=[]; sessions=[]
    pgns=['1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5 4. c3 Nf6 5. d4 exd4 6. cxd4 Bb4+ 7. Nc3 Nxe4 8. O-O Bxc3 9. d5 Bf6 10. Re1 Ne7 11. Rxe4 d6 12. Bg5 Bxg5 13. Nxg5 h6 14. Qe2 hxg5 15. Re1 Be6 16. dxe6 f6 17. Rd1 g4 18. Bd5 c6 19. Bxc6+ Nxc6 20. Qe3 Qd7 21. exd7+ Kxd7 22. Qxe5 Rae8 23. Qxc7+ Kxc7 24. Rd5 1-0']
    t=now
    for i in range(14):
        t=t-datetime.timedelta(days=1,hours=random.randint(0,5))
        color=random.choice(['w','b']); res=random.choice(['1-0','0-1','1-0','1/2-1/2']); 
        out='draw' if res=='1/2-1/2' else ('win' if (res=='1-0')==(color=='w') else 'loss')
        cnt={'best':random.randint(3,9),'excellent':random.randint(2,6),'good':random.randint(2,8),'book':random.randint(3,6),'inaccuracy':random.randint(0,4),'mistake':random.randint(0,3),'blunder':random.randint(0,2),'miss':random.randint(0,1),'brilliant':random.randint(0,1),'great':random.randint(0,2)}
        ph=lambda n:{'n':n,'acc':random.randint(55,95),'bad':random.randint(0,3)}
        g={'key':f'seed{i}','at':t.isoformat()+'Z','src':'bot','color':color,'result':res,'outcome':out,'opp':random.choice([1000,1400,1800]),'tc':random.choice(['5+3','10+5','-']),'plies':random.randint(30,80),'endgame':random.random()<.5,
           'review':{'v':1,'moves':random.randint(18,40),'acc':random.randint(55,96),'counts':cnt,'phases':{'opening':ph(8),'middlegame':ph(14),'endgame':ph(6)},'hung':random.randint(0,2),'missed':random.randint(0,2),'peakWin':random.randint(50,98),'endEntry':random.randint(30,90)}}
        games.append(g)
        sessions.append({'id':1000+i,'created_at':t.isoformat()+'Z','result':res,'plies':g['plies'],'pgn':f'[Event "x"]\n[Result "{res}"]\n\n{pgns[0]}'.replace('1-0',res,1) if False else pgns[0]})
    puz={'v':1,'attempted':40,'solved':27,'clean':19,'timeMs':1260000,'byTheme':{'fork':{'tried':10,'solved':8,'firstTry':6,'timeMs':200000},'pin':{'tried':8,'solved':4,'firstTry':2,'timeMs':240000},'mate':{'tried':12,'solved':9,'firstTry':7,'timeMs':400000},'deflection':{'tried':5,'solved':2,'firstTry':1,'timeMs':180000}},'solvedIds':[],'failedIds':[]}
    op={'v':1,'lessons':{'italian':{'done':True,'runs':2,'mistakes':1},'ruy':{'done':True,'runs':1,'mistakes':0},'sicilian':{'done':True,'runs':1,'mistakes':3}},'repertoires':[],'cards':{},'activeId':None,'stats':{'answered':64,'correct':51,'timeMs':540000,'sessions':6}}
    act={'v':1,'days':[(now-datetime.timedelta(days=d)).strftime('%Y-%m-%d') for d in range(0,5)],'daily':{}}
    return {'chess-coach-ai:games:v1':{'v':1,'games':games},'chess-coach-ai:sessions:v1':sessions,'chess-coach-ai:puzzles:v1':puz,'chess-coach-ai:openings:v1':op,'chess-coach-ai:activity:v1':act}
JS="(()=>{const d=%s;for(const k in d){ if(!localStorage.getItem(k)) localStorage.setItem(k,JSON.stringify(d[k])) }})()" % json.dumps(seed())
