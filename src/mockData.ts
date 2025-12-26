export const initialStrips = [
  { 
    id: 's1', 
    callSign: 'BAZ-1', 
    type: 'F15', 
    sq: '106', // טייסת
    alt: '250', // גובה
    task: 'CAP', // משימה
    workTime: '00:45', // זמן עבודה
    x: 0, y: 0, onMap: false 
  },
  { 
    id: 's2', 
    callSign: 'SUFA-4', 
    type: 'F16I', 
    sq: '107', 
    alt: '180', 
    task: 'STRIKE', 
    workTime: '01:20', 
    x: 0, y: 0, onMap: false 
  }
];

export const battleZones = [
  { id: 'z10', name: 'LLR-10', points: '150,500 350,550 400,800 100,750', labelPos: {x: 230, y: 650} },
  { id: 'z4', name: 'LLD-4', points: '180,250 350,280 320,450 150,420', labelPos: {x: 230, y: 350} },
];