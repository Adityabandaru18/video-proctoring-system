import dynamic from "next/dynamic";
const ProctoringPageImpl = dynamic(() => import("./ProctoringPageImpl"), {
  ssr: false,
});
export default ProctoringPageImpl;
