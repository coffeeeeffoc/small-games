declare module 'phaser/src/physics/matter-js/CustomMain.js' {
  const Matter: { Body: typeof MatterJS.Body; Bodies: typeof MatterJS.Bodies; Composite: typeof MatterJS.Composite; Constraint: typeof MatterJS.Constraint; Engine: typeof MatterJS.Engine; Query: typeof MatterJS.Query & { collides(body: MatterJS.BodyType, bodies: MatterJS.BodyType[]): { normal: {x:number;y:number} }[] }; Vector: typeof MatterJS.Vector; Events: typeof MatterJS.Events };
  export default Matter;
}
