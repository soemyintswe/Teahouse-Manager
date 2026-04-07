import { customFetch } from "@workspace/api-client-react";

export type RoomRecord = {
  id: number;
  code: string;
  name: string;
  isActive: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

export type CreateRoomInput = {
  code: string;
  name: string;
  isActive?: boolean;
  sortOrder?: number;
};

export type UpdateRoomInput = Partial<CreateRoomInput>;

export const ROOMS_QUERY_KEY = ["rooms"] as const;

export async function listRooms(): Promise<RoomRecord[]> {
  return customFetch<RoomRecord[]>("/api/rooms", { method: "GET", responseType: "json" });
}

export async function createRoom(payload: CreateRoomInput): Promise<RoomRecord> {
  return customFetch<RoomRecord>("/api/rooms", {
    method: "POST",
    responseType: "json",
    body: JSON.stringify(payload),
  });
}

export async function updateRoom(id: number, payload: UpdateRoomInput): Promise<RoomRecord> {
  return customFetch<RoomRecord>(`/api/rooms/${id}`, {
    method: "PATCH",
    responseType: "json",
    body: JSON.stringify(payload),
  });
}

export async function deleteRoom(id: number): Promise<void> {
  await customFetch<void>(`/api/rooms/${id}`, {
    method: "DELETE",
    responseType: "json",
  });
}
