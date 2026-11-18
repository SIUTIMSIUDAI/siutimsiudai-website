import { useLocalSearchParams } from "expo-router";
import { FamilyMemberLogScreen } from "@/screens/FamilyMemberLogScreen";

export default function FamilyMemberLogRoute() {
  const { memberId, name } = useLocalSearchParams<{ memberId: string; name?: string }>();
  return <FamilyMemberLogScreen memberId={memberId} name={name ?? null} />;
}
