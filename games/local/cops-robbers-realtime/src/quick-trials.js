export const QUICK_TRIALS = [
  {id:1,name:'桥口夹击',nodes:[[100,300],[500,300],[900,300]],edges:[[0,1],[1,2]],cops:[0,2],robbers:[1],timeLimit:20,par:8,
    hint:'选 1、2 号，各点一次中间的小偷。两侧一起靠近才会合围。',lesson:'单人靠近只会拦路；另一侧到位，圆环才开始收网。',solution:[{cop:0,node:1},{cop:1,node:1}]},
  {id:2,name:'三岔收口',nodes:[[500,300],[100,300],[900,300],[500,60]],edges:[[0,1],[0,2],[0,3]],cops:[1,2,3],robbers:[0],timeLimit:22,par:10,
    hint:'三条退路要分头封住。选每位队员，点中间路口。',lesson:'两个人离得近还不够：岔路的每个方向都要有人封住。',solution:[{cop:0,node:0},{cop:1,node:0},{cop:2,node:0}]},
  {id:3,name:'双街协作',nodes:[[100,180],[500,180],[900,180],[100,420],[500,420],[900,420]],edges:[[0,1],[1,2],[3,4],[4,5],[0,3],[2,5]],cops:[0,2,3,5],robbers:[1,4],timeLimit:25,par:12,
    hint:'1、2 号夹上街；3、4 号夹下街。不要让全队追同一个人。',lesson:'分组指挥比排队追更快；一组收网时，另一组还要守住自己的退路。',solution:[{cop:0,node:1},{cop:1,node:1},{cop:2,node:4},{cop:3,node:4}]},
].map(level=>({...level,mode:'quick',chapter:0,exits:[],policeSpeed:160,robberSpeed:100,guarantee:'已验证短场合围',redeploy:[],nodes:level.nodes.map(([x,y])=>({x,y}))}));
