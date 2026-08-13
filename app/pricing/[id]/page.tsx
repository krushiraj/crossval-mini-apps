import { DocumentEditor } from "./document-editor";

const PricingDocumentPage = async ({ params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  return <DocumentEditor documentId={id} />;
};

export default PricingDocumentPage;
