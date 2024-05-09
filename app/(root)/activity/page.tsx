
import { FetchUsers, fetchUser, getActivity } from "@/lib/actions/user.actions";
import { currentUser } from "@clerk/nextjs";
import Image from "next/image";
import Link from "next/link";
import { redirect } from 'next/navigation';


async function Page() {
  const user = await currentUser();
  if (!user) return null;

  const userInfo = await fetchUser(user.id);
  if (!userInfo?.onboarded) redirect('/onboarding');

  //getActivity
  const activity = await getActivity(userInfo._id);

  const result = await FetchUsers({
    userId: user.id,
    searchString: '',
    pageNumber: 1,
    pageSize: 25
  });
  return (
    <section>
      <h1 className="head-text mb-10">
        Activity
      </h1>
      <section className="mt-10 flex flex-col gap-5">
        {activity.length > 0
          ? (
            <>
              {activity.map((activity) => (
                <Link 
                key={activity._id} 
                href={`/post/${activity.parentId}`}>
                  <article className="activity-card">
                    <Image 
                    src={activity.author.image}
                    alt="Profile image"
                    width={20}
                    height={20}
                    className="rounded-full object-cover"
                    />
                    <p className="!text-small-regular text-light-1">
                      <span className="mr-1 text-primary-500">
                        {activity.author.name}
                      </span> {"  "}
                      comment to your post
                    </p>
                  </article>
                </Link>
              ))}
            </>)
          : (
            <p className="!text-base-regular text-light-2">No activity yet</p>
          )}
      </section>
    </section>
  )
}

export default Page;