import { useLocalSearchParams } from "expo-router";
import { HelperDishScreen } from "@/screens/HelperDishScreen";

export default function HelperDishRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <HelperDishScreen dishId={id} />;
}
