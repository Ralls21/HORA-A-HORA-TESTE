import { StudentProfile } from "@/components/student-profile";

export default async function StudentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <StudentProfile studyId={Number(id)} />;
}
