export type EmailAttachment = {
  content: string;
  name: string;
};

export type SerializedBuffer = {
  type: 'Buffer';
  data: number[];
};
