import StudioWorkspace from "@/components/StudioWorkspace";

export default function StudioProjectPage({ params }: { params: { id: string } }) {
  return <StudioWorkspace projectId={Number(params.id)} />;
}
